import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, KeyRound, Settings, LogOut, User2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const menuItems = [
    { label: "View Profile", icon: User, onClick: () => navigate("/profile") },
    {
      label: "Change Password",
      icon: KeyRound,
      onClick: () => navigate("/change-password"),
    },
    { label: "Settings", icon: Settings, onClick: () => navigate("/settings") },
    { label: "Logout", icon: LogOut, onClick: handleLogout },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer text-gray-500 hover:text-teal-500 transition-colors"
      >
        <User size={32} />
      </button>

      {open && (
        <div className="absolute right-0 mt-4.5 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          {menuItems.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={() => {
                onClick();
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full p-3 text-sm text-left cursor-pointer border-b border-gray-100 text-gray-500 hover:bg-teal-50 hover:text-teal-500 transition-colors">
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
