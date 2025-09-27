import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getChartColors() {
  if (typeof window === 'undefined') return ["#8884d8", "#82ca9d", "#ffc658", "#ff7c7c", "#8dd1e1", "#d084d0", "#ffb347", "#87d068"];
  
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  
  return [
    `hsl(${computedStyle.getPropertyValue('--chart-1').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-2').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-3').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-4').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-5').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-6').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-7').trim()})`,
    `hsl(${computedStyle.getPropertyValue('--chart-8').trim()})`,
  ];
}
