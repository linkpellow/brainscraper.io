const metrics: Record<string, number> = {};

export const incrementMetric = (name: string): void => {
  metrics[name] = (metrics[name] ?? 0) + 1;
  console.info(`[METRIC] ${name}`, { count: metrics[name] });
};
