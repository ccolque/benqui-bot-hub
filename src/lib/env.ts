export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const graphApiVersion = () => process.env.GRAPH_API_VERSION ?? "v22.0";
