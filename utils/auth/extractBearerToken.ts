export const extractBearerToken = (request: Request): string | undefined => {
  const header = request.headers.get('authorization');
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return undefined;
  const token = match[1].trim();
  return token.length > 0 ? token : undefined;
};
