import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/Home'
import DeployPage from './pages/Deploy'
import ExplorePage from './pages/Explore'
import MyProxiesPage from './pages/MyProxies'
import ProxyDetailPage from './pages/ProxyDetail'
import DocsPage from './pages/Docs'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/deploy" element={<DeployPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/my-proxies" element={<MyProxiesPage />} />
        <Route path="/proxy/:address" element={<ProxyDetailPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:section" element={<DocsPage />} />
      </Route>
    </Routes>
  )
}
