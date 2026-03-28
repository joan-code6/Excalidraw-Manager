import { Client, Account, Databases } from 'appwrite';

const client = new Client();

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID;
const canvasesCollectionId = import.meta.env.VITE_APPWRITE_CANVASES_COLLECTION_ID;

export const APPWRITE_ENABLED =
  typeof endpoint === 'string' && endpoint.trim().length > 0 &&
  typeof projectId === 'string' && projectId.trim().length > 0;

export const APPWRITE_DB_ENABLED =
  APPWRITE_ENABLED &&
  typeof databaseId === 'string' && databaseId.trim().length > 0 &&
  typeof canvasesCollectionId === 'string' && canvasesCollectionId.trim().length > 0;

if (APPWRITE_ENABLED) {
  client.setEndpoint(endpoint as string);
  client.setProject(projectId as string);
}

const account = new Account(client);
const databases = new Databases(client);

export const APPWRITE_DATABASE_ID = databaseId as string | undefined;
export const APPWRITE_CANVASES_COLLECTION_ID = canvasesCollectionId as string | undefined;

export { client, account, databases };
