export class AuthResponse {
  constructor(
    public accessToken: string,
    public tokenType: string = 'bearer'
  ) {}

  static fromJson(json: any): AuthResponse {
    return new AuthResponse(json.access_token, json.token_type ?? 'bearer');
  }
}
