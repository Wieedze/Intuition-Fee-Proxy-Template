import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/Home'
import DeployPage from './pages/Deploy'
import MyProxiesPage from './pages/MyProxies'
import ProxyDetailPage from './pages/ProxyDetail'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/deploy" element={<DeployPage />} />
        <Route path="/my-proxies" element={<MyProxiesPage />} />
        <Route path="/proxy/:address" element={<ProxyDetailPage />} />
      </Route>
    </Routes>
  )
}
