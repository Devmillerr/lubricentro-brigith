import { ValidationError } from '@nestjs/common';
import { FieldError, ValidationProblemException } from './exceptions/problem.exception';

function flatten(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownErrors: FieldError[] = error.constraints
      ? Object.values(error.constraints).map((message) => ({ field: path, message }))
      : [];
    const childErrors = error.children?.length ? flatten(error.children, path) : [];
    return [...ownErrors, ...childErrors];
  });
}

/** Usado por el ValidationPipe global para producir `errors[]` en el formato de 06-API.md. */
export function validationExceptionFactory(errors: ValidationError[]): ValidationProblemException {
  return new ValidationProblemException(flatten(errors));
}
