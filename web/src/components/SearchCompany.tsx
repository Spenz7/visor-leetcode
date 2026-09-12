import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { searchCompanies } from "~/lib/localData";
import { Building2 } from "lucide-react";
import { Spinner } from "./ui/spinner";

type CompanyResult = {
  id: number;
  name: string;
  problem_count: number;
};

export default function SearchCompany() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const companies = await searchCompanies(query.trim());
        setResults(companies);
        setOpen(true);
      } catch (err) {
        console.error("[SearchCompany] failed to search:", err);
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(company: CompanyResult) {
    setOpen(false);
    setQuery("");
    navigate(`/company/${company.id}`);
  }

  return (
    <div className="relative w-full max-w-full sm:w-96" ref={containerRef}>
      <div className="relative">
        <Field>
          <Input
            placeholder="Search a company..."
            className="bg-input/30 h-8 w-full rounded-sm shadow-none"
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              if (!val.trim()) {
                setResults([]);
                setOpen(false);
              }
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
          />
        </Field>
        {loading && <Spinner className="absolute top-2 right-2" />}
      </div>

      {open && (
        <div className="bg-background border-border absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          {loading ? (
            <div className="text-muted-foreground px-3 py-2 text-sm">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="text-muted-foreground px-3 py-2 text-sm">
              No companies found
            </div>
          ) : (
            <ul>
              {results.map((company) => (
                <li key={company.id}>
                  <button
                    className="hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
                    onClick={() => handleSelect(company)}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="text-primary text-sm">
                        {company.name}
                      </span>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {company.problem_count}{" "}
                      {company.problem_count === 1 ? "problem" : "problems"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
