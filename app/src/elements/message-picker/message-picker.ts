import { bindable, INode, resolve } from 'aurelia';
import type { MessageOptions } from '../../interfaces/message-options';
import type { MessageTemplate } from '../../interfaces/message-template';
import { WorkspaceService } from '../../services/workspace-service';
import { ValidatedForm } from '../../services/validated-form';

export class MessagePicker extends ValidatedForm {
  constructor() {
    super();
    this.requireText('name', 'Template name');
  }

  readonly workspace = resolve(WorkspaceService);
  private element = resolve(INode) as HTMLElement;
  anchor!: HTMLElement;
  open = false;
  options: MessageOptions = { recent: [], template: '', suggested: '' };
  templates: MessageTemplate[] = [];
  name = '';
  saving = false;

  @bindable
  message = '';

  async binding() {
    try {
      this.templates = JSON.parse(localStorage.getItem('commit-templates') || '[]');
      this.options = await this.workspace.client.messageOptions();
      if (!this.message.trim() && this.options.suggested) {
        this.choose(this.options.suggested);
      }
    } catch (error) {
      this.workspace.fail(error);
    }
  }

  async show() {
    try {
      this.options = await this.workspace.client.messageOptions();
      this.open = true;
    } catch (error) {
      this.workspace.fail(error);
    }
  }

  choose(text: string) {
    this.element.dispatchEvent(new CustomEvent('message-chosen', { detail: text, bubbles: true }));
  }

  async saveTemplate() {
    if (!(await this.validateFields('name'))) {
      return;
    }
    const name = this.name.trim();
    if (!name || !this.message.trim()) {
      return;
    }
    this.templates = [...this.templates.filter(template => template.name !== name), { name, text: this.message }];
    localStorage.setItem('commit-templates', JSON.stringify(this.templates));
    this.name = '';
    this.saving = false;
    this.workspace.inform('Message template saved');
  }

  removeTemplate(template: MessageTemplate, event: Event) {
    event.stopPropagation();
    this.templates = this.templates.filter(item => item !== template);
    localStorage.setItem('commit-templates', JSON.stringify(this.templates));
  }
}
