import { Construction } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

interface ComingSoonProps {
  platform: string;
}

export default function ComingSoon({ platform }: ComingSoonProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <Construction className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-2xl font-bold">{platform}</h1>
      <p className="text-muted-foreground max-w-md">
        यो platform को integration छिट्टै आउँदैछ। अहिलेको लागि Messenger मा काम गर्नुहोस्।
      </p>
      <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
        Coming Soon
      </span>
    </div>
  );
}
