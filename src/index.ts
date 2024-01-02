import { App } from './app';
import './main.css';

document.addEventListener("DOMContentLoaded", function(){
    const app = new App();
    (window as any).app = app;
});