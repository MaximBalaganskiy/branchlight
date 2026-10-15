import type { MergeDraft } from '../interfaces/merge-draft';

export class MergeDrafts {
  private database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('branchlight-merge-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async read(repo: string, path: string): Promise<MergeDraft | undefined> {
    const database = await this.database;
    return new Promise((resolve, reject) => {
      const request = database.transaction('drafts').objectStore('drafts').get([repo, path]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async write(repo: string, path: string, draft?: MergeDraft) {
    const database = await this.database;
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      if (draft) {
        store.put(draft, [repo, path]);
      } else {
        store.delete([repo, path]);
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
