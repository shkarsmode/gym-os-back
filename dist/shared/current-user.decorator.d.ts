export type RequestUser = {
    id: string;
    email: string;
    displayName: string;
};
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
