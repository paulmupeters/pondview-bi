declare module "bun" {
  // Lightweight typing for Bun's SQL constructor used in this project
  export class SQL {
    constructor(filePath: string);
    exec(sql: string): void;
  }
}


