import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: ErrorPayload = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error occurred.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();
      const message =
        typeof responseBody === 'string'
          ? responseBody
          : (responseBody as { message?: string | string[] }).message ??
            exception.message;

      payload = {
        code: HttpStatus[status] ?? 'ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
        details: typeof responseBody === 'object' ? responseBody : undefined,
      };
    }

    response.status(status).json({
      success: false,
      data: null,
      error: payload,
    });
  }
}
