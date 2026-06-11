import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AppProvider } from './context/AppContext';

// MARKER-MAKE-KIT-INVOKED
// MARKER-MAKE-KIT-DISCOVERY-READ

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
