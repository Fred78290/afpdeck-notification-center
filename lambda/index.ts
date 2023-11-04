import { apiHandler } from './app';
import { authHandler } from './authorizer';

export default {
    api: apiHandler,
    auth: authHandler,
};
