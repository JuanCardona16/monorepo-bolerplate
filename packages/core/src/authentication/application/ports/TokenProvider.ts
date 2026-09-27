export interface TokenPayload {
  userUuid: string;
  roles: string[];
}

export interface TokenProvider {
  generate(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<TokenPayload | null>;
}