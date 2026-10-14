import { resolve } from 'aurelia';
import { IDialogService } from '@aurelia/dialog';
import { RepositoryDialog } from './repository-dialog/repository-dialog';
import { WorkspaceService } from '../../services/workspace-service';
import './welcome.css';

export class Welcome {
  readonly workspace = resolve(WorkspaceService);
  private dialogs = resolve(IDialogService);

  create(mode: string) {
    return this.dialogs.open({ component: RepositoryDialog, model: mode });
  }

  basename(value: string) {
    return value.split(/[\\/]/).pop();
  }
}
