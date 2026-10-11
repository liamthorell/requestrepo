#[cfg(test)]
mod tests {
    use crate::utils::config::CONFIG;
    use crate::utils::names::{self, ClaimError};
    use crate::utils::{
        generate_session_jwt, get_file_path_from_url, get_subdomain_from_hostname,
        get_subdomain_from_path, jwt_claim_id, verify_jwt,
    };
    use std::sync::Mutex;

    // The registry is process-wide; keep these tests from interleaving.
    static LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn validates_names() {
        assert_eq!(names::validate(" SSRF-Lab ").unwrap(), "ssrf-lab");
        for bad in [
            "ab",
            "-abc",
            "abc-",
            "a--b",
            "has space",
            "dots.no",
            "www",
            "abcdefgh",
        ] {
            assert!(
                matches!(names::validate(bad), Err(ClaimError::Invalid(_))),
                "{bad} should be rejected"
            );
        }
        // Same length as random IDs is fine with a hyphen in it.
        assert!(names::validate("ssrf-lab").is_ok());
        assert!(names::validate(&"a".repeat(33)).is_err());
    }

    #[test]
    fn claimed_names_route_and_authenticate() {
        let _guard = LOCK.lock().unwrap();
        names::clear_for_tests();
        let domain = &CONFIG.server_domain;

        assert_eq!(get_subdomain_from_hostname(&format!("xss.{domain}")), None);
        let (name, cid) = names::claim("xss", 1).unwrap();
        assert_eq!(names::claim("XSS", 2), Err(ClaimError::Taken));

        assert_eq!(
            get_subdomain_from_hostname(&format!("xss.{domain}")),
            Some(name.clone())
        );
        assert_eq!(
            get_subdomain_from_hostname(&format!("a.b.xss.{domain}.")),
            Some(name.clone())
        );
        assert_eq!(
            get_subdomain_from_hostname(&format!("XSS.{domain}:443")),
            Some(name.clone())
        );
        assert_eq!(
            get_subdomain_from_hostname(&format!("notxss.{domain}")),
            None
        );
        assert_eq!(get_subdomain_from_path("/r/xss/a/b"), Some(name.clone()));
        assert_eq!(get_file_path_from_url("/r/xss/a/b", true), "/a/b");
        // Random subdomains are untouched.
        assert_eq!(
            get_subdomain_from_hostname(&format!("abcdefgh.{domain}")),
            Some("abcdefgh".to_string())
        );
        assert_eq!(
            verify_jwt(&generate_session_jwt("abcdefgh", None).unwrap()),
            Some("abcdefgh".into())
        );

        let token = generate_session_jwt(&name, Some(cid.clone())).unwrap();
        assert_eq!(verify_jwt(&token), Some(name.clone()));
        assert_eq!(jwt_claim_id(&token), Some(cid.clone()));
        // A custom name without its claim id is not accepted.
        assert_eq!(
            verify_jwt(&generate_session_jwt(&name, None).unwrap()),
            None
        );

        assert!(!names::release(&name, "wrong-id"));
        assert!(names::release(&name, &cid));
        assert_eq!(verify_jwt(&token), None);
        assert_eq!(get_subdomain_from_hostname(&format!("xss.{domain}")), None);

        // Re-claiming issues a new id; the old token stays dead.
        let (_, cid2) = names::claim("xss", 3).unwrap();
        assert_ne!(cid, cid2);
        assert_eq!(verify_jwt(&token), None);
        names::clear_for_tests();
    }
}
