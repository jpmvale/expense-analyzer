import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca uma rota como isenta do guard de sessão — login, checagem de sessão e liveness. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
