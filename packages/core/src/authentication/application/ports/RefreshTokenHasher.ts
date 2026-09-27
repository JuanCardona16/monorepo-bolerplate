export interface RefreshTokenHasher {
  hash(rawToken: string): Promise<string>;
  verify(rawToken: string, tokenHash: string): Promise<boolean>;
}
