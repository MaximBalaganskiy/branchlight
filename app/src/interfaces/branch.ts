export interface Branch {
  fullName: string;
  name: string;
  hash: string;
  upstream: string;
  tracking: string;
  kind: 'local' | 'remote' | 'tag';
}
