import { TokensList } from 'marked';

export class TokenUtils {
  static findTokensOfType(tokens: TokensList, type: string, found: any[] = []): any[] {
    for (const token of tokens) {
      if (token.type === type) {
        found.push(token);
      }

      if ('tokens' in token && Array.isArray((token as any).tokens)) {
        this.findTokensOfType((token as any).tokens as TokensList, type, found);
      }
    }

    return found;
  }
}
