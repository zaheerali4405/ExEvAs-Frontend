export default function AuthLayout({ children }) {
  return (
    <div className="flex w-screen h-screen">
      <div className="hidden md:block w-7/10 h-full">
        <img
          src="../../../CMHLMC_Image.jpg"
          alt="CMH Lahore Medical College"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="w-full md:w-3/10 h-full flex flex-col items-center justify-center px-8">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src="../../../CMHLMC_Icon.png" alt="CMH LMC & IOD" className="w-24 h-24 mb-3" />
            <h1 className="text-2xl font-bold">ExEvAs Scheduling Engine</h1>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}