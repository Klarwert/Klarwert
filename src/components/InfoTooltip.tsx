import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InfoTooltipProps {
  label: string;
}

export function InfoTooltip({ label }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex size-5 items-center justify-center rounded-full text-slate" tabIndex={0}>
          <Info className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
