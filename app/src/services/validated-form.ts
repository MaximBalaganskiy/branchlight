import { newInstanceForScope, resolve } from 'aurelia';
import { IValidationRules } from '@aurelia/validation';
import { IValidationController } from '@aurelia/validation-html';

export abstract class ValidatedForm {
  readonly validationController = resolve(newInstanceForScope(IValidationController));
  protected readonly rules = resolve(IValidationRules);

  protected requireText(property: keyof this, label: string) {
    return this.rules
      .on(this)
      .ensure(property)
      .displayName(label)
      .satisfies(value => typeof value === 'string' && value.trim().length > 0)
      .withMessage('${$displayName} is required.');
  }

  protected requireRef(property: keyof this, label: string) {
    return this.requireText(property, label)
      .then()
      .satisfies(value => typeof value === 'string' && !/\s/.test(value) && !value.startsWith('-'))
      .withMessage('${$displayName} must not contain spaces or start with a hyphen.');
  }

  protected async validateFields(...properties: (keyof this & string)[]) {
    const results = await Promise.all(properties.map(propertyName => this.validationController.validate({ object: this, propertyName })));
    return results.every(result => result.valid);
  }
}
