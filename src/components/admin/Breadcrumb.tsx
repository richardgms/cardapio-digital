"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
    return (
        <nav className="flex items-center text-sm mb-6" aria-label="Breadcrumb">
            <ol className="flex items-center">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;

                    return (
                        <li key={index} className="flex items-center">
                            {index > 0 && (
                                <ChevronRight className="h-4 w-4 text-gray-400 mx-2" />
                            )}
                            {isLast ? (
                                <span className="font-medium text-gray-900" aria-current="page">
                                    {item.label}
                                </span>
                            ) : (
                                <Link 
                                    href={item.href || "#"} 
                                    className="text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    {item.label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
