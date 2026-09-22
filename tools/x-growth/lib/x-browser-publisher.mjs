import fs from 'node:fs';
import { assertSourceSnapshot, sourceDestinations } from './source-snapshot.mjs';
import { submitPreparedReply } from './reply-verification.mjs';
import { isPaused } from './state.mjs';

const DEFAULT_PROFILE = '/Users/openclaw/.hermes/profiles/engineering/browser-profiles/derabona-x';
const err = (code, message) => Object.assign(new Error(message), { code });

// This function is also exercised verbatim in the dedicated live CLI session.
export async function prepareReplyComposer(page, job, preparedSourceId = null, destinations) {
  const fail = (code) => { throw Object.assign(new Error(code), { code }); };
  const dialogs = page.locator('[role="dialog"]:not(:has([role="dialog"])):visible');
  if (await dialogs.count()) {
    if (preparedSourceId !== job.sourceId) fail('composer_already_open');
  } else {
    const article = page.locator('article').filter({ has: page.locator(`a[href="/${job.sourceHandle}/status/${job.sourceId}"]`) });
    await article.waitFor({ state: 'visible', timeout: 15000 });
    if (await article.count() !== 1) fail('source_unreadable');
    await assertSourceSnapshot(job, article, {destinations});
    await article.locator('[data-testid="reply"]').click();
  }
  await dialogs.locator('[contenteditable="true"]').first().waitFor({ state: 'visible', timeout: 10000 });
  if (await dialogs.count() !== 1) fail('composer_ambiguous');
  const composer = dialogs.locator('[data-testid="tweetTextarea_0"][contenteditable="true"]');
  if (await composer.count() !== 1) fail('composer_ambiguous');
  const parentText = dialogs.locator('[data-testid="tweetText"]');
  if (await parentText.count() !== 1 || !await dialogs.locator(`a[href="/${job.sourceHandle}"]`).count()) fail('composer_parent_mismatch');
  await assertSourceSnapshot(job, dialogs, {destinations, code:'composer_parent_mismatch'});
  const submit = dialogs.locator('[data-testid="tweetButton"]');
  if (await submit.count() !== 1) fail('composer_ambiguous');
  const existing = await composer.innerText();
  if (existing.trim() && existing !== job.replyText) fail('composer_not_empty');
  if (existing !== job.replyText) {
    // Never append or retry typing after a failed readback.
    await composer.fill(job.replyText);
  }
  if (await composer.innerText() !== job.replyText) fail('composer_mismatch');
  if (!await submit.isEnabled()) fail('composer_submit_disabled');
  return { composer, submit };
}

export class XBrowserPublisher {
  constructor({ profilePath = DEFAULT_PROFILE, playwright, launchOptions = { headless: true }, baseUrl = 'https://x.com', homeUrl, fixtureMode = false, resolveUrl } = {}) {
    this.resolveUrl = resolveUrl;
    this.profilePath = profilePath;
    this.playwright = playwright;
    this.launchOptions = launchOptions;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.homeUrl = homeUrl || `${this.baseUrl}/home`;
    this.fixtureMode = fixtureMode;
  }

  async _context() {
    if (this.context) return this.context;
    if (!this.playwright) this.playwright = await import('playwright');
    fs.mkdirSync(this.profilePath, { recursive: true, mode: 0o700 });
    this.context = await this.playwright.chromium.launchPersistentContext(this.profilePath, this.launchOptions);
    this.page = this.context.pages()[0] || await this.context.newPage();
    return this.context;
  }

  async preflight() {
    await this._context();
    await this.page.goto(this.homeUrl, { waitUntil: 'domcontentloaded' });
    await this.page.locator('[data-testid="AppTabBar_Profile_Link"], input[autocomplete="username"]').first().waitFor({ timeout: 15000 }).catch(() => {});
    const body = await this.page.locator('body').innerText();
    const challenge = /captcha|verify|unusual activity/i.test(body);
    const login = /sign in|log in/i.test(body);
    if (challenge) return { authenticated: false, challengePresent: true, accountHandle: null };
    if (login) return { authenticated: false, challengePresent: false, accountHandle: null };
    const link = this.page.locator('[data-testid="AppTabBar_Profile_Link"]').first();
    const href = await link.getAttribute('href').catch(() => null);
    return { authenticated: !!href, challengePresent: false, accountHandle: href?.replace(/^\//, '').split('/')[0] || null };
  }

  async inspectSource(job) {
    await this._context();
    await this.page.goto(job.sourceUrl, { waitUntil: 'domcontentloaded' });
    const article = this.page.locator('article').filter({has:this.page.locator(`a[href="/${job.sourceHandle}/status/${job.sourceId}"]`)});
    await article.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await article.count() !== 1) throw err('source_unreadable', 'source post not unique');
    const href = await article.locator(`a[href*="/status/${job.sourceId}"]`).first().getAttribute('href');
    const id = href?.match(/status\/(\d+)/)?.[1];
    const handle = href?.split('/')[1];
    const textLocator = article.locator('[data-testid="tweetText"]').first();
    const text = await (await textLocator.count() ? textLocator : article).innerText();
    this.destinations = await sourceDestinations(job, this.resolveUrl);
    await assertSourceSnapshot(job, article, {destinations:this.destinations});
    return { id, handle, text, canReply: await article.locator('[data-testid="reply"]').count() === 1 };
  }

  async prepareReply(job) {
    const destinations = this.destinations || await sourceDestinations(job, this.resolveUrl);
    const result = await prepareReplyComposer(this.page, job, this.preparedSourceId, destinations);
    this.preparedSourceId = job.sourceId;
    return result;
  }

  async publish(job) {
    const checkAuthority = () => {
      if (isPaused()) throw err('paused', 'PAUSE active');
      if (job.expiresAt && !(Date.now() < Date.parse(job.expiresAt))) throw err('approval_expired', 'original batch approval deadline reached');
    };
    checkAuthority();
    const source = await this.inspectSource(job);
    if (source.id !== job.sourceId || source.handle?.toLowerCase() !== job.sourceHandle.toLowerCase() || !source.canReply) throw err('source_changed', 'source no longer matches approved snapshot');
    const pre = await this.preflight();
    if (pre.challengePresent) throw err('challenge_required', 'X challenge present');
    if (!pre.authenticated || pre.accountHandle?.toLowerCase() !== 'derabona_club') throw err('auth_required', 'not authenticated as derabona_club');

    await this.page.goto(job.sourceUrl, { waitUntil: 'domcontentloaded' });
    this.preparedSourceId = null;
    const { composer, submit } = await this.prepareReply(job);
    if (await composer.innerText() !== job.replyText) throw err('composer_mismatch', 'composer text changed');
    checkAuthority();
    if (!this.fixtureMode) return submitPreparedReply(this.page, job, { composer, submit, destinations:this.destinations });
    await submit.click();
    const result = this.page.locator(`article[data-testid="reply-result"][data-parent="${job.sourceId}"]`).last();
    if (!await result.count()) throw err('uncertain_submission', 'reply result was not readable after submission');
    const href = await result.locator('a[href*="/status/"]').first().getAttribute('href');
    const id = href?.match(/status\/(\d+)/)?.[1];
    const text = await result.locator('div').last().innerText();
    const publication = { id, url: new URL(href, this.baseUrl).toString(), authorHandle: href?.split('/')[1], text, parentId: await result.getAttribute('data-parent') };
    if (!publication.id || publication.authorHandle?.toLowerCase() !== 'derabona_club' || publication.text !== job.replyText || publication.parentId !== job.sourceId) throw err('verification_mismatch', 'reply result did not match the queued job');
    return publication;
  }

  async reconcile() { return { kind: 'unresolved' }; }
  async close() { await this.context?.close(); this.context = null; }
}
