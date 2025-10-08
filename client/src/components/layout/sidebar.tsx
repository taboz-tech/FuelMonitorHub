import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  MapPin, 
  TrendingUp, 
  Users, 
  Settings 
} from "lucide-react";

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, current: false },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp, current: false },
];

const adminNavigation = [
  { name: 'User Management', href: '/users', icon: Users, current: false },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  const handleNavigation = (href: string) => {
    setLocation(href);
  };

  const isCurrentPage = (href: string) => {
    return location === href;
  };

  return (
    <nav className="w-64 bg-white shadow-sm h-screen sticky top-16 overflow-y-auto">
      <div className="p-6">
        <ul className="space-y-2">
          {navigation.map((item) => (
            <li key={item.name}>
              <button
                onClick={() => handleNavigation(item.href)}
                className={cn(
                  "w-full flex items-center px-4 py-3 text-left rounded-lg transition duration-200",
                  isCurrentPage(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-gray-700 hover:bg-primary/5 hover:text-primary"
                )}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </button>
            </li>
          ))}
          
          {/* Admin-only menu items */}
          {user?.role === 'admin' && (
            <>
              <li className="pt-4">
                <div className="px-4 py-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Administration
                  </h3>
                </div>
              </li>
              {adminNavigation.map((item) => (
                <li key={item.name}>
                  <button
                    onClick={() => handleNavigation(item.href)}
                    className={cn(
                      "w-full flex items-center px-4 py-3 text-left rounded-lg transition duration-200",
                      isCurrentPage(item.href)
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 hover:bg-primary/5 hover:text-primary"
                    )}
                  >
                    <item.icon className="w-5 h-5 mr-3" />
                    {item.name}
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
    </nav>
  );
}
