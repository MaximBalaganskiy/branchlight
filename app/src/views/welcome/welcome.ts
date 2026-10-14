import { resolve } from 'aurelia';
import { WorkspaceService } from '../../services/workspace-service';
import './welcome.css';

export class Welcome {
  readonly workspace = resolve(WorkspaceService);

  basename(value: string) {
    return value.split(/[\\/]/).pop();
  }
}
