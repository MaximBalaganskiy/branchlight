import { observable } from 'aurelia';

export class AppearanceService {
  @observable
  theme = localStorage.getItem('branchlight-theme') === 'light' ? 'light' : 'dark';
  themeChanged() {
    document.documentElement.dataset.theme = this.theme;
    localStorage.setItem('branchlight-theme', this.theme);
  }

  @observable
  density = localStorage.getItem('branchlight-density') === 'compact' ? 'compact' : 'normal';
  densityChanged() {
    document.documentElement.dataset.density = this.density;
    localStorage.setItem('branchlight-density', this.density);
  }

  constructor() {
    this.themeChanged();
    this.densityChanged();
  }

  get rowHeight() {
    return this.density === 'compact' ? 26 : 34;
  }
}
