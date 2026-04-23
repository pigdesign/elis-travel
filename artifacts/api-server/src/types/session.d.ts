import "express-session";

declare module "express-session" {
  interface SessionData {
    adminUser: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }
}
