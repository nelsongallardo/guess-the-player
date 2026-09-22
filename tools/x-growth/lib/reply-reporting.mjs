import { loadPosts, recordPost } from './state.mjs';

export function projectPublishedReply(job, { posts = loadPosts(), persist = recordPost } = {}) {
  if (!job.publishedId || !job.publishedUrl) throw new Error('verified publication is required for projection');
  if (posts.some(post => post.browserReplyId === job.publishedId || post.tweetId === job.publishedId)) return false;
  persist({
    kind: 'reply', handle: job.sourceHandle, text: job.replyText,
    tweetId: job.publishedId, browserReplyId: job.publishedId,
    sourceId: job.sourceId, url: job.publishedUrl, transport: 'browser',
  });
  return true;
}
