import { CategoryManager } from "@/components/admin/categories/CategoryManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";

export default function CategoriesPage() {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Categorias" }
            ]} />
            <CategoryManager />
        </div>
    );
}
