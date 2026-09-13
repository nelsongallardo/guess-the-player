export type User = { id: string; is_anonymous?: boolean };
export type Dependencies = {
  getUser: (token: string) => Promise<User | null>;
  rpc: (userId: string | null, request: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  deleteUser: (id: string) => Promise<boolean>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const competitions = new Set(['all','champions-league','premier-league','la-liga','argentine-primera','brasileirao']);
const schemas: Record<string,string[]> = {
  progress: ['action'], start: ['action','competition','idempotencyKey'],
  hint: ['action','roundId','expectedVersion','idempotencyKey'],
  answer: ['action','roundId','expectedVersion','optionId','idempotencyKey'],
  enroll: ['action','nickname','idempotencyKey'], leaderboard: ['action','competition','limit','offset'],
};
export const statuses: Record<string,number> = {
  UNAUTHORIZED:401, INVALID_REQUEST:400, INVALID_COMPETITION:400, INVALID_NICKNAME:400,
  INVALID_OPTION:400, ROUND_NOT_FOUND:404, VERSION_CONFLICT:409, ROUND_FINISHED:409,
  IDEMPOTENCY_CONFLICT:409, HINT_LIMIT:409, ALREADY_GUESSED:409, NICKNAME_TAKEN:409, RATE_LIMITED:429,
};
export function allowedOrigin(origin: string): boolean {
  if (origin === 'https://derabona.club') return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:','https:'].includes(url.protocol) && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  } catch { return false; }
}
function validUUID(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
export function validate(body: Record<string,unknown>): boolean {
  const action = body.action;
  if (typeof action !== 'string' || !Object.hasOwn(schemas,action)) return false;
  if (Object.keys(body).some(k=>!schemas[action].includes(k))) return false;
  if ('competition' in body && (typeof body.competition !== 'string' || !competitions.has(body.competition))) return false;
  if (['start','hint','answer','enroll'].includes(action) && !validUUID(body.idempotencyKey)) return false;
  if (['hint','answer'].includes(action) && (!validUUID(body.roundId) || !Number.isInteger(body.expectedVersion) || Number(body.expectedVersion)<0 || Number(body.expectedVersion)>999999999)) return false;
  if (action==='answer' && !validUUID(body.optionId)) return false;
  if (action==='enroll' && (typeof body.nickname !== 'string' || !/^[\p{L}\p{N} _.-]{3,24}$/u.test(body.nickname) || body.nickname.trim()!==body.nickname)) return false;
  if ('limit' in body && (!Number.isInteger(body.limit) || Number(body.limit)<1 || Number(body.limit)>100)) return false;
  if ('offset' in body && (!Number.isInteger(body.offset) || Number(body.offset)<0 || Number(body.offset)>10000)) return false;
  return true;
}
async function readJSON(req: Request): Promise<Record<string,unknown>> {
  // Bound streamed bytes as well as Content-Length (which is not trustworthy).
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw Error('INVALID_REQUEST');
  const reader = req.body?.getReader();
  if (!reader) throw Error('INVALID_REQUEST');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {value,done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size>8192) { await reader.cancel(); throw Error('INVALID_REQUEST'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  const parsed = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('INVALID_REQUEST');
  return parsed;
}
export function handler(deps: Dependencies, mode: 'ranked-game'|'account-delete' = 'ranked-game') {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers = new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'});
    const reply = (data: unknown,status=200) => new Response(JSON.stringify(data),{status,headers});
    const error = (code: string,status=statuses[code] || 500) => {
      if (status===429) headers.set('Retry-After','60');
      return reply({error:{code,message:code==='INTERNAL_ERROR'?'The server could not complete this request.':code}},status);
    };
    if (origin && !allowedOrigin(origin)) return error('ORIGIN_NOT_ALLOWED',403);
    if (origin) headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers','authorization, apikey, content-type, x-client-info');
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (req.method!=='POST') {headers.set('Allow','POST, OPTIONS');return error('METHOD_NOT_ALLOWED',405);}
    let body: Record<string,unknown>;
    try { body=await readJSON(req); } catch { return error('INVALID_REQUEST'); }
    if (mode==='ranked-game' ? !validate(body) : Object.keys(body).length!==1 || body.confirmation!=='DELETE') return error('INVALID_REQUEST');
    const auth = req.headers.get('authorization');
    let user: User|null = null;
    // CORS is only a browser boundary, never authentication. getUser verifies
    // the supplied bearer with Supabase Auth; never decode and trust JWT data.
    if (auth) {
      const match = /^Bearer ([^\s]+)$/i.exec(auth);
      if (!match) return error('UNAUTHORIZED');
      try { user=await deps.getUser(match[1]); } catch { return error('UNAUTHORIZED'); }
      if (!user || !validUUID(user.id) || user.is_anonymous) return error('UNAUTHORIZED');
    }
    if (!user && (mode==='account-delete' || body.action!=='leaderboard')) return error('UNAUTHORIZED');
    try {
      if (mode==='account-delete') {
        if (!await deps.deleteUser(user!.id)) return error('INTERNAL_ERROR');
        return reply({deleted:true});
      }
      const result = await deps.rpc(user?.id ?? null,body);
      if (result.error) {
        const code = result.error.message || '';
        return error(Object.hasOwn(statuses,code)?code:'INTERNAL_ERROR');
      }
      if (result.data && typeof result.data==='object' && 'error' in result.data) {
        const code = (result.data as {error:{code:string}}).error.code;
        return error(Object.hasOwn(statuses,code)?code:'INTERNAL_ERROR');
      }
      return reply(result.data);
    } catch { return error('INTERNAL_ERROR'); }
  };
}
