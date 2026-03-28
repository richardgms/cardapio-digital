import { BusinessHoursManager } from "@/components/admin/hours/BusinessHoursManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";

export default function HorariosPage() {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Horários de Funcionamento" }
            ]} />
            <BusinessHoursManager />
        </div>
    );
}
