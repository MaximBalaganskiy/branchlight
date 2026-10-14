export interface GitActionPrompt {
  title: string;
  description: string;
  action: string;
  payload: Record<string, unknown>;
  confirm: string;
  danger?: boolean;
}
