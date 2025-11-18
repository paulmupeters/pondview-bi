import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  value: string | number | boolean | Date | null | undefined;
  title: string;
  description?: string;
  takeaway?: string;
  className?: string;
}

export function MetricCard({
  value,
  title,
  description,
  takeaway,
  className,
}: MetricCardProps) {
  const formattedValue = (() => {
    if (typeof value === "number") {
      return value.toLocaleString();
    }
    if (typeof value === "boolean") {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    return String(value ?? "");
  })();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        <div className="text-4xl font-bold text-foreground">
          {formattedValue}
        </div>
        {description && (
          <div className="text-sm text-muted-foreground mt-2">
            {description}
          </div>
        )}
        {takeaway && (
          <div className="text-xs text-muted-foreground mt-2 italic">
            {takeaway}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
