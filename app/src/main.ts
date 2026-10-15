import Aurelia from 'aurelia';
import { SVGAnalyzer } from '@aurelia/runtime-html';
import { AureliaHeadlessConfiguration, UiValidationControllerFactory } from '@aurelia-ui-toolkits/headless';
import { ValidationHtmlConfiguration, ValidationTrigger } from '@aurelia/validation-html';
import { App } from './views/app/app';
import './styles/theme.css';
import './styles/layout.css';
import './styles/scrollbar.css';

Aurelia.register(
  ValidationHtmlConfiguration.customize(options => {
    options.ValidationControllerFactoryType = UiValidationControllerFactory;
    options.DefaultTrigger = ValidationTrigger.changeOrFocusout;
  }),
  AureliaHeadlessConfiguration.customize(config => {
    config.field.defaultInset = true;
  }),
  SVGAnalyzer
)
  .app(App)
  .start();
