import { Result, Button } from "antd";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";

export default function Forbidden() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <Result
        status="403"
        title="403"
        subTitle="You do not have permission to access this page."
        extra={
          <Button type="primary" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        }
      />
    </DashboardLayout>
  );
}
