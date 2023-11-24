import { apiHandler } from './api';
import { authHandler } from './authorizer';

export default {
    api: apiHandler,
    auth: authHandler,
};
