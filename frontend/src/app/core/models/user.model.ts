export class User {
  constructor(
    public id: string,
    public email: string,
    public fullName: string,
    public createdAt?: Date
  ) {}

  static fromJson(json: any): User {
    return new User(
      json.id,
      json.email,
      json.full_name,
      json.created_at ? new Date(json.created_at) : undefined
    );
  }
}
