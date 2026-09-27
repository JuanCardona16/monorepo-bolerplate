export class Password {
  readonly value: string;

  constructor(value: string) {
    if (!this.isValidPassword(value)) {
      throw new Error(
        "La contraseña debe tener al menos 8 caracteres, incluyendo una letra mayúscula, una letra minúscula y un número.",
      );
    }
    this.value = value;
  }

  private isValidPassword(password: string): boolean {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return passwordRegex.test(password);
  }
}