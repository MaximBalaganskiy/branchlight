import Aurelia from 'aurelia';
import { SVGAnalyzer } from '@aurelia/runtime-html';
import { AureliaHeadlessConfiguration } from '@aurelia-ui-toolkits/headless';
import { App } from './views/app/app';
import './styles/theme.css';
import './styles/layout.css';
import './styles/scrollbar.css';

Aurelia.register(
  AureliaHeadlessConfiguration.customize(config => {
    config.field.defaultInset = true;
  }),
  SVGAnalyzer
)
  .app(App)
  .start();
