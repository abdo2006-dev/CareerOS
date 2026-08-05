import { NavLink, Outlet } from 'react-router'

export function ProfileLayout() {
  return (
    <section>
      <nav aria-label="Profile sections">
        <NavLink to="/profile" end>
          Overview
        </NavLink>
        <NavLink to="/profile/basic">Basic profile</NavLink>
        <NavLink to="/profile/education">Education</NavLink>
        <NavLink to="/profile/experience">Experience</NavLink>
      </nav>
      <Outlet />
    </section>
  )
}
