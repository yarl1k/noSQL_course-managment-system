import { MongoClient, type Db } from 'mongodb';

let mongoClient: MongoClient | null = null;

export async function getMongoDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const databaseName = process.env.MONGODB_DATABASE || 'lms_nosql';

  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    try {
      await mongoClient.connect();
    } catch (error) {
      mongoClient = null;
      throw error;
    }
  }

  return mongoClient.db(databaseName);
}

export async function closeMongo(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
}
