import { initializeDatabase as initializeSchemaDatabase, repairExistingItems } from './schema';

export async function initializeDatabase(): Promise<void> {
  await initializeSchemaDatabase();
  await repairExistingItems();
}
