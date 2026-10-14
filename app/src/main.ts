import Aurelia from 'aurelia';
import { SVGAnalyzer } from '@aurelia/runtime-html';
import { AureliaHeadlessConfiguration } from '@aurelia-ui-toolkits/headless';
import { MyApp } from './my-app';
import './styles.css';
Aurelia.register(AureliaHeadlessConfiguration, SVGAnalyzer).app(MyApp).start();
