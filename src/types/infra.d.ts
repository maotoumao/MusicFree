export interface IInjectable {
    injectDependencies (...args: unknown[]): void;
}