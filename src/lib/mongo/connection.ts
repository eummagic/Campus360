import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & { __campus360Mongo?: MongoClient };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getMongoClient(): MongoClient {
  if (!globalForMongo.__campus360Mongo) {
    globalForMongo.__campus360Mongo = new MongoClient(requireEnv("MONGODB_URI"), {
      appName: "campus360",
      maxPoolSize: 10,
      retryWrites: true,
    });
  }
  return globalForMongo.__campus360Mongo;
}

export function getDb(): Db {
  return getMongoClient().db(requireEnv("MONGODB_DB"));
}
