export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_credentials: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          is_active: boolean | null
          label: string | null
          last_login_at: string | null
          password_hash: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_login_at?: string | null
          password_hash: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_login_at?: string | null
          password_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_matches: {
        Row: {
          availability_score: number | null
          budget_score: number | null
          completion_score: number | null
          created_at: string | null
          experience_score: number | null
          freelancer_id: string
          id: string
          match_score: number
          project_id: string
          skill_score: number | null
        }
        Insert: {
          availability_score?: number | null
          budget_score?: number | null
          completion_score?: number | null
          created_at?: string | null
          experience_score?: number | null
          freelancer_id: string
          id?: string
          match_score: number
          project_id: string
          skill_score?: number | null
        }
        Update: {
          availability_score?: number | null
          budget_score?: number | null
          completion_score?: number | null
          created_at?: string | null
          experience_score?: number | null
          freelancer_id?: string
          id?: string
          match_score?: number
          project_id?: string
          skill_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_matches_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_matches_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_matches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      certifications: {
        Row: {
          created_at: string | null
          credential_id: string | null
          credential_url: string | null
          expiration_date: string | null
          file_url: string | null
          id: string
          issue_date: string | null
          issuer: string
          name: string
          user_id: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          credential_id?: string | null
          credential_url?: string | null
          expiration_date?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuer: string
          name: string
          user_id: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          credential_id?: string | null
          credential_url?: string | null
          expiration_date?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string
          name?: string
          user_id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "certifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          description: string | null
          id: string
          industry: string | null
          location: string | null
          size: string | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          size?: string | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          size?: string | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connects_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_inquiries: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      contest_comments: {
        Row: {
          content: string
          contest_id: string
          created_at: string | null
          id: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          contest_id: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          contest_id?: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_comments_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contest_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_submissions: {
        Row: {
          contest_id: string
          created_at: string | null
          description: string | null
          file_type: string | null
          file_url: string | null
          freelancer_id: string
          id: string
          preview_url: string | null
          prize_amount: number | null
          rank: number | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          contest_id: string
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          freelancer_id: string
          id?: string
          preview_url?: string | null
          prize_amount?: number | null
          rank?: number | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          contest_id?: string
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          freelancer_id?: string
          id?: string
          preview_url?: string | null
          prize_amount?: number | null
          rank?: number | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contest_submissions_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_submissions_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_submissions_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_votes: {
        Row: {
          created_at: string | null
          id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "contest_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          category: string
          client_id: string
          contest_type: string
          created_at: string | null
          description: string
          end_date: string
          id: string
          max_submissions: number | null
          prize_amount: number
          second_prize: number | null
          skills_required: string[] | null
          start_date: string | null
          status: string
          submission_count: number | null
          third_prize: number | null
          title: string
          updated_at: string | null
          winner_id: string | null
        }
        Insert: {
          category: string
          client_id: string
          contest_type?: string
          created_at?: string | null
          description: string
          end_date: string
          id?: string
          max_submissions?: number | null
          prize_amount: number
          second_prize?: number | null
          skills_required?: string[] | null
          start_date?: string | null
          status?: string
          submission_count?: number | null
          third_prize?: number | null
          title: string
          updated_at?: string | null
          winner_id?: string | null
        }
        Update: {
          category?: string
          client_id?: string
          contest_type?: string
          created_at?: string | null
          description?: string
          end_date?: string
          id?: string
          max_submissions?: number | null
          prize_amount?: number
          second_prize?: number | null
          skills_required?: string[] | null
          start_date?: string | null
          status?: string
          submission_count?: number | null
          third_prize?: number | null
          title?: string
          updated_at?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contests_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contests_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_files: {
        Row: {
          contract_id: string
          created_at: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          public_url: string
          uploaded_by: string
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          public_url: string
          uploaded_by: string
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          public_url?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_files_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number
          client_id: string
          created_at: string | null
          end_date: string | null
          freelancer_amount: number
          freelancer_id: string
          hourly_rate: number | null
          id: string
          milestones: Json | null
          platform_fee: number
          project_id: string
          proposal_id: string | null
          rate_type: string | null
          shared_notes: string | null
          shared_tasks: Json | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string | null
          end_date?: string | null
          freelancer_amount: number
          freelancer_id: string
          hourly_rate?: number | null
          id?: string
          milestones?: Json | null
          platform_fee: number
          project_id: string
          proposal_id?: string | null
          rate_type?: string | null
          shared_notes?: string | null
          shared_tasks?: Json | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string | null
          end_date?: string | null
          freelancer_amount?: number
          freelancer_id?: string
          hourly_rate?: number | null
          id?: string
          milestones?: Json | null
          platform_fee?: number
          project_id?: string
          proposal_id?: string | null
          rate_type?: string | null
          shared_notes?: string | null
          shared_tasks?: Json | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount: number
          client_id: string
          contract_id: string
          created_at: string | null
          description: string
          freelancer_id: string
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          amount: number
          client_id: string
          contract_id: string
          created_at?: string | null
          description: string
          freelancer_id: string
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string
          contract_id?: string
          created_at?: string | null
          description?: string
          freelancer_id?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      education_history: {
        Row: {
          activities: string | null
          created_at: string | null
          degree: string | null
          end_date: string | null
          field_of_study: string | null
          grade: string | null
          id: string
          school: string
          start_date: string | null
          user_id: string
        }
        Insert: {
          activities?: string | null
          created_at?: string | null
          degree?: string | null
          end_date?: string | null
          field_of_study?: string | null
          grade?: string | null
          id?: string
          school: string
          start_date?: string | null
          user_id: string
        }
        Update: {
          activities?: string | null
          created_at?: string | null
          degree?: string | null
          end_date?: string | null
          field_of_study?: string | null
          grade?: string | null
          id?: string
          school?: string
          start_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "education_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "education_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_history: {
        Row: {
          company: string
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          is_current: boolean | null
          role: string
          start_date: string
          user_id: string
        }
        Insert: {
          company: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          role: string
          start_date: string
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          role?: string
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow: {
        Row: {
          amount: number
          auto_release_enabled: boolean | null
          client_id: string
          contract_id: string
          created_at: string | null
          current_milestone: number | null
          freelancer_id: string
          funded_at: string | null
          id: string
          last_auto_release_at: string | null
          milestone_completion_criteria: Json | null
          milestones: Json | null
          released_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          auto_release_enabled?: boolean | null
          client_id: string
          contract_id: string
          created_at?: string | null
          current_milestone?: number | null
          freelancer_id: string
          funded_at?: string | null
          id?: string
          last_auto_release_at?: string | null
          milestone_completion_criteria?: Json | null
          milestones?: Json | null
          released_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          auto_release_enabled?: boolean | null
          client_id?: string
          contract_id?: string
          created_at?: string | null
          current_milestone?: number | null
          freelancer_id?: string
          funded_at?: string | null
          id?: string
          last_auto_release_at?: string | null
          milestone_completion_criteria?: Json | null
          milestones?: Json | null
          released_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escrow_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_events: {
        Row: {
          contract_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          severity: string
          user_id: string | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          severity?: string
          user_id?: string | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_profiles: {
        Row: {
          availability: boolean | null
          bio: string | null
          certifications: string[] | null
          completion_rate: number | null
          created_at: string | null
          education: string | null
          experience: number | null
          hire_rate: number | null
          hourly_rate: number | null
          id: string
          languages: string[] | null
          location: string | null
          on_time_delivery_rate: number | null
          portfolio_url: string | null
          rating: number | null
          repeat_hire_rate: number | null
          reputation_score: number | null
          response_rate: number | null
          seller_level: string | null
          skills: string[] | null
          title: string | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string
          weighted_rating: number | null
        }
        Insert: {
          availability?: boolean | null
          bio?: string | null
          certifications?: string[] | null
          completion_rate?: number | null
          created_at?: string | null
          education?: string | null
          experience?: number | null
          hire_rate?: number | null
          hourly_rate?: number | null
          id?: string
          languages?: string[] | null
          location?: string | null
          on_time_delivery_rate?: number | null
          portfolio_url?: string | null
          rating?: number | null
          repeat_hire_rate?: number | null
          reputation_score?: number | null
          response_rate?: number | null
          seller_level?: string | null
          skills?: string[] | null
          title?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id: string
          weighted_rating?: number | null
        }
        Update: {
          availability?: boolean | null
          bio?: string | null
          certifications?: string[] | null
          completion_rate?: number | null
          created_at?: string | null
          education?: string | null
          experience?: number | null
          hire_rate?: number | null
          hourly_rate?: number | null
          id?: string
          languages?: string[] | null
          location?: string | null
          on_time_delivery_rate?: number | null
          portfolio_url?: string | null
          rating?: number | null
          repeat_hire_rate?: number | null
          reputation_score?: number | null
          response_rate?: number | null
          seller_level?: string | null
          skills?: string[] | null
          title?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string
          weighted_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_skills: {
        Row: {
          created_at: string | null
          experience_level: string | null
          freelancer_id: string
          hourly_rate: number | null
          id: string
          is_verified: boolean | null
          skill_id: string
        }
        Insert: {
          created_at?: string | null
          experience_level?: string | null
          freelancer_id: string
          hourly_rate?: number | null
          id?: string
          is_verified?: boolean | null
          skill_id: string
        }
        Update: {
          created_at?: string | null
          experience_level?: string | null
          freelancer_id?: string
          hourly_rate?: number | null
          id?: string
          is_verified?: boolean | null
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_skills_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_skills_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          created_at: string | null
          document_number: string | null
          document_type: string
          document_url: string
          expiry_date: string | null
          id: string
          rejection_reason: string | null
          status: string
          updated_at: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_number?: string | null
          document_type: string
          document_url: string
          expiry_date?: string | null
          id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_number?: string | null
          document_type?: string
          document_url?: string
          expiry_date?: string | null
          id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_applications: {
        Row: {
          available_from: string | null
          available_to: string | null
          country: string | null
          cover_letter: string
          created_at: string
          degree: string | null
          education: string | null
          email: string
          full_name: string
          github_url: string | null
          google_meet_link: string | null
          graduation_date: string | null
          graduation_year: string | null
          id: string
          linkedin_url: string | null
          notes: string | null
          phone: string | null
          portfolio_url: string | null
          resume_file_name: string | null
          resume_file_path: string | null
          resume_url: string | null
          role_id: string
          role_name: string
          status: string
          university: string | null
          updated_at: string
          weekly_availability: number | null
          why_growlancer: string | null
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          country?: string | null
          cover_letter: string
          created_at?: string
          degree?: string | null
          education?: string | null
          email: string
          full_name: string
          github_url?: string | null
          google_meet_link?: string | null
          graduation_date?: string | null
          graduation_year?: string | null
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_file_name?: string | null
          resume_file_path?: string | null
          resume_url?: string | null
          role_id: string
          role_name: string
          status?: string
          university?: string | null
          updated_at?: string
          weekly_availability?: number | null
          why_growlancer?: string | null
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          country?: string | null
          cover_letter?: string
          created_at?: string
          degree?: string | null
          education?: string | null
          email?: string
          full_name?: string
          github_url?: string | null
          google_meet_link?: string | null
          graduation_date?: string | null
          graduation_year?: string | null
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_file_name?: string | null
          resume_file_path?: string | null
          resume_url?: string | null
          role_id?: string
          role_name?: string
          status?: string
          university?: string | null
          updated_at?: string
          weekly_availability?: number | null
          why_growlancer?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          client_id: string
          created_at: string | null
          expires_at: string | null
          freelancer_id: string
          id: string
          message: string | null
          project_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          expires_at?: string | null
          freelancer_id: string
          id?: string
          message?: string | null
          project_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          expires_at?: string | null
          freelancer_id?: string
          id?: string
          message?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          created_at: string | null
          id: string
          language: string
          proficiency: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          language: string
          proficiency: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          language?: string
          proficiency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "languages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "languages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          contract_id: string
          conversation_id: string | null
          created_at: string | null
          delivered_at: string | null
          id: string
          is_read: boolean | null
          message_type: string | null
          read_at: string | null
          receiver_id: string | null
          sender_id: string
          typing_indicator: boolean | null
          typing_started_at: string | null
          typing_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          contract_id: string
          conversation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          read_at?: string | null
          receiver_id?: string | null
          sender_id: string
          typing_indicator?: boolean | null
          typing_started_at?: string | null
          typing_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          contract_id?: string
          conversation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          read_at?: string | null
          receiver_id?: string | null
          sender_id?: string
          typing_indicator?: boolean | null
          typing_started_at?: string | null
          typing_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_typing_user_id_fkey"
            columns: ["typing_user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_typing_user_id_fkey"
            columns: ["typing_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          amount: number
          contract_id: string | null
          created_at: string
          due_date: string | null
          id: string
          project_id: string | null
          status: string
          title: string
        }
        Insert: {
          amount?: number
          contract_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          project_id?: string | null
          status?: string
          title: string
        }
        Update: {
          amount?: number
          contract_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          project_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          brevo_contact_id: string | null
          created_at: string | null
          email: string
          id: string
          metadata: Json | null
          name: string | null
          source: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
          unsubscribed_reason: string | null
          updated_at: string | null
        }
        Insert: {
          brevo_contact_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          metadata?: Json | null
          name?: string | null
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
          unsubscribed_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          brevo_contact_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
          unsubscribed_reason?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          contracts_email: boolean | null
          contracts_in_app: boolean | null
          contracts_push: boolean | null
          created_at: string | null
          digest_day_of_week: number | null
          digest_frequency: string | null
          digest_time_of_day: string | null
          disputes_email: boolean | null
          disputes_in_app: boolean | null
          disputes_push: boolean | null
          id: string
          marketing_email: boolean | null
          marketing_in_app: boolean | null
          marketing_push: boolean | null
          messages_email: boolean | null
          messages_in_app: boolean | null
          messages_push: boolean | null
          milestones_email: boolean | null
          milestones_in_app: boolean | null
          milestones_push: boolean | null
          payments_email: boolean | null
          payments_in_app: boolean | null
          payments_push: boolean | null
          proposals_email: boolean | null
          proposals_in_app: boolean | null
          proposals_push: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contracts_email?: boolean | null
          contracts_in_app?: boolean | null
          contracts_push?: boolean | null
          created_at?: string | null
          digest_day_of_week?: number | null
          digest_frequency?: string | null
          digest_time_of_day?: string | null
          disputes_email?: boolean | null
          disputes_in_app?: boolean | null
          disputes_push?: boolean | null
          id?: string
          marketing_email?: boolean | null
          marketing_in_app?: boolean | null
          marketing_push?: boolean | null
          messages_email?: boolean | null
          messages_in_app?: boolean | null
          messages_push?: boolean | null
          milestones_email?: boolean | null
          milestones_in_app?: boolean | null
          milestones_push?: boolean | null
          payments_email?: boolean | null
          payments_in_app?: boolean | null
          payments_push?: boolean | null
          proposals_email?: boolean | null
          proposals_in_app?: boolean | null
          proposals_push?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contracts_email?: boolean | null
          contracts_in_app?: boolean | null
          contracts_push?: boolean | null
          created_at?: string | null
          digest_day_of_week?: number | null
          digest_frequency?: string | null
          digest_time_of_day?: string | null
          disputes_email?: boolean | null
          disputes_in_app?: boolean | null
          disputes_push?: boolean | null
          id?: string
          marketing_email?: boolean | null
          marketing_in_app?: boolean | null
          marketing_push?: boolean | null
          messages_email?: boolean | null
          messages_in_app?: boolean | null
          messages_push?: boolean | null
          milestones_email?: boolean | null
          milestones_in_app?: boolean | null
          milestones_push?: boolean | null
          payments_email?: boolean | null
          payments_in_app?: boolean | null
          payments_push?: boolean | null
          proposals_email?: boolean | null
          proposals_in_app?: boolean | null
          proposals_push?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          archived: boolean | null
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          archived?: boolean | null
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          archived?: boolean | null
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_events: {
        Row: {
          client_id: string | null
          created_at: string
          event_type: string
          freelancer_id: string
          id: string
          project_id: string | null
          source: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          event_type: string
          freelancer_id: string
          id?: string
          project_id?: string | null
          source?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          event_type?: string
          freelancer_id?: string
          id?: string
          project_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_events_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_events_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_holder_name: string | null
          account_number_last_four: string | null
          bank_name: string | null
          card_brand: string | null
          card_expiry: string | null
          card_last_four: string | null
          created_at: string
          id: string
          is_default: boolean
          paypal_email: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number_last_four?: string | null
          bank_name?: string | null
          card_brand?: string | null
          card_expiry?: string | null
          card_last_four?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          paypal_email?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_number_last_four?: string | null
          bank_name?: string | null
          card_brand?: string | null
          card_expiry?: string | null
          card_last_four?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          paypal_email?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payout_methods: {
        Row: {
          created_at: string | null
          details: Json
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          label: string | null
          type: string
          updated_at: string | null
          user_id: string
          verification_attempts: number | null
          verification_code: string | null
          verification_expires_at: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          details: Json
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          label?: string | null
          type: string
          updated_at?: string | null
          user_id: string
          verification_attempts?: number | null
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          label?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
          verification_attempts?: number | null
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paypal_disputes: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          dispute_id: string
          id: string
          processor_response: Json | null
          reason: string | null
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          dispute_id: string
          id?: string
          processor_response?: Json | null
          reason?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          dispute_id?: string
          id?: string
          processor_response?: Json | null
          reason?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      paypal_orders: {
        Row: {
          amount: number
          approved_at: string | null
          captured_at: string | null
          contract_id: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          metadata: Json | null
          order_type: string
          paypal_order_id: string
          paypal_payer_email: string | null
          paypal_payer_id: string | null
          status: string
          subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          captured_at?: string | null
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_type: string
          paypal_order_id: string
          paypal_payer_email?: string | null
          paypal_payer_id?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          captured_at?: string | null
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_type?: string
          paypal_order_id?: string
          paypal_payer_email?: string | null
          paypal_payer_id?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paypal_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paypal_orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      paypal_transactions: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          payer_email: string | null
          payer_name: Json | null
          paypal_order_id: string | null
          paypal_transaction_id: string
          processor_response: Json | null
          shipping_details: Json | null
          status: string
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payer_email?: string | null
          payer_name?: Json | null
          paypal_order_id?: string | null
          paypal_transaction_id: string
          processor_response?: Json | null
          shipping_details?: Json | null
          status: string
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payer_email?: string | null
          payer_name?: Json | null
          paypal_order_id?: string | null
          paypal_transaction_id?: string
          processor_response?: Json | null
          shipping_details?: Json | null
          status?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "paypal_transactions_paypal_order_id_fkey"
            columns: ["paypal_order_id"]
            isOneToOne: false
            referencedRelation: "paypal_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          media_urls: string[] | null
          project_url: string | null
          sort_order: number | null
          tags: string[] | null
          technologies_used: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          media_urls?: string[] | null
          project_url?: string | null
          sort_order?: number | null
          tags?: string[] | null
          technologies_used?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          media_urls?: string[] | null
          project_url?: string | null
          sort_order?: number | null
          tags?: string[] | null
          technologies_used?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string | null
          banned_at: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          id: string
          is_admin: boolean
          is_pro: boolean | null
          name: string
          onboarding_completed: boolean | null
          phone: string | null
          rating: number | null
          referral_code: string | null
          role: string
          suspend_reason: string | null
          suspended_at: string | null
          suspended_by: string | null
          total_reviews: number | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          banned_at?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          id: string
          is_admin?: boolean
          is_pro?: boolean | null
          name: string
          onboarding_completed?: boolean | null
          phone?: string | null
          rating?: number | null
          referral_code?: string | null
          role: string
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          total_reviews?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          banned_at?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          is_admin?: boolean
          is_pro?: boolean | null
          name?: string
          onboarding_completed?: boolean | null
          phone?: string | null
          rating?: number | null
          referral_code?: string | null
          role?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          total_reviews?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          project_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          project_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_matches: {
        Row: {
          created_at: string | null
          freelancer_id: string
          id: string
          match_score: number
          project_id: string
          skill_match_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          freelancer_id: string
          id?: string
          match_score: number
          project_id: string
          skill_match_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          freelancer_id?: string
          id?: string
          match_score?: number
          project_id?: string
          skill_match_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_matches_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_matches_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_matches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_skills: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          skill_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_skills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          category: string | null
          client_id: string
          created_at: string | null
          deadline: string | null
          description: string
          experience_level: string | null
          id: string
          skills_required: string[] | null
          status: string | null
          title: string
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          category?: string | null
          client_id: string
          created_at?: string | null
          deadline?: string | null
          description: string
          experience_level?: string | null
          id?: string
          skills_required?: string[] | null
          status?: string | null
          title: string
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          category?: string | null
          client_id?: string
          created_at?: string | null
          deadline?: string | null
          description?: string
          experience_level?: string | null
          id?: string
          skills_required?: string[] | null
          status?: string | null
          title?: string
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          application_type: string | null
          created_at: string | null
          estimated_duration: number | null
          freelancer_id: string
          id: string
          message: string
          project_id: string
          proposed_rate: number | null
          rate_type: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          application_type?: string | null
          created_at?: string | null
          estimated_duration?: number | null
          freelancer_id: string
          id?: string
          message: string
          project_id: string
          proposed_rate?: number | null
          rate_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          application_type?: string | null
          created_at?: string | null
          estimated_duration?: number | null
          freelancer_id?: string
          id?: string
          message?: string
          project_id?: string
          proposed_rate?: number | null
          rate_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          active: boolean | null
          created_at: string | null
          device_name: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string | null
          id: string
          identifier: string
          route: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string | null
          id?: string
          identifier: string
          route: string
          window_start?: string
        }
        Update: {
          count?: number
          created_at?: string | null
          id?: string
          identifier?: string
          route?: string
          window_start?: string
        }
        Relationships: []
      }
      razorpay_orders: {
        Row: {
          amount: number
          captured_at: string | null
          contract_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          order_type: string
          razorpay_order_id: string
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          captured_at?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          order_type: string
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          captured_at?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          order_type?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          method: string | null
          payer_contact: string | null
          payer_email: string | null
          processor_response: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_transaction_id: string | null
          status: string
          transaction_type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          payer_contact?: string | null
          payer_email?: string | null
          processor_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_transaction_id?: string | null
          status?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          payer_contact?: string | null
          payer_email?: string | null
          processor_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_transaction_id?: string | null
          status?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_transactions_razorpay_order_id_fkey"
            columns: ["razorpay_order_id"]
            isOneToOne: false
            referencedRelation: "razorpay_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_codes: {
        Row: {
          code_hash: string
          created_at: string | null
          id: string
          used: boolean | null
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          id?: string
          used?: boolean | null
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          id?: string
          used?: boolean | null
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recovery_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_stats: {
        Row: {
          created_at: string | null
          id: string
          level: number | null
          points: number | null
          total_referrals: number | null
          updated_at: string | null
          user_id: string
          valid_referrals: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          level?: number | null
          points?: number | null
          total_referrals?: number | null
          updated_at?: string | null
          user_id: string
          valid_referrals?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          level?: number | null
          points?: number | null
          total_referrals?: number | null
          updated_at?: string | null
          user_id?: string
          valid_referrals?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          activated_at: string | null
          bonus_claimed: boolean | null
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          status: string | null
        }
        Insert: {
          activated_at?: string | null
          bonus_claimed?: boolean | null
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email: string
          referred_user_id?: string | null
          referrer_id: string
          status?: string | null
        }
        Update: {
          activated_at?: string | null
          bonus_claimed?: boolean | null
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_replies: {
        Row: {
          content: string
          created_at: string | null
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          communication_rating: number | null
          contract_id: string
          created_at: string | null
          id: string
          professionalism_rating: number | null
          quality_rating: number | null
          rating: number
          reviewee_id: string
          reviewer_id: string
          timeliness_rating: number | null
          updated_at: string | null
          would_hire_again: boolean | null
        }
        Insert: {
          comment?: string | null
          communication_rating?: number | null
          contract_id: string
          created_at?: string | null
          id?: string
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating: number
          reviewee_id: string
          reviewer_id: string
          timeliness_rating?: number | null
          updated_at?: string | null
          would_hire_again?: boolean | null
        }
        Update: {
          comment?: string | null
          communication_rating?: number | null
          contract_id?: string
          created_at?: string | null
          id?: string
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
          timeliness_rating?: number | null
          updated_at?: string | null
          would_hire_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_payment_cards: {
        Row: {
          card_expiry_month: string | null
          card_expiry_year: string | null
          card_holder_name: string | null
          card_id: string
          card_last_four: string
          card_network: string | null
          card_type: string | null
          created_at: string
          id: string
          is_default: boolean
          last_used_at: string | null
          razorpay_customer_id: string | null
          used_count: number
          user_id: string
        }
        Insert: {
          card_expiry_month?: string | null
          card_expiry_year?: string | null
          card_holder_name?: string | null
          card_id: string
          card_last_four: string
          card_network?: string | null
          card_type?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string | null
          razorpay_customer_id?: string | null
          used_count?: number
          user_id: string
        }
        Update: {
          card_expiry_month?: string | null
          card_expiry_year?: string | null
          card_holder_name?: string | null
          card_id?: string
          card_last_four?: string
          card_network?: string | null
          card_type?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string | null
          razorpay_customer_id?: string | null
          used_count?: number
          user_id?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          created_at: string | null
          filters: Json | null
          id: string
          name: string
          notify_new_results: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          name: string
          notify_new_results?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          name?: string
          notify_new_results?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          service_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          service_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean | null
          category: string
          created_at: string | null
          delivery_days: number
          description: string
          features: Json | null
          freelancer_id: string
          id: string
          image_url: string | null
          orders: number | null
          price: number
          price_type: string | null
          rating: number | null
          requirements: string | null
          reviews_count: number | null
          revisions: number | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          active?: boolean | null
          category: string
          created_at?: string | null
          delivery_days: number
          description: string
          features?: Json | null
          freelancer_id: string
          id?: string
          image_url?: string | null
          orders?: number | null
          price: number
          price_type?: string | null
          rating?: number | null
          requirements?: string | null
          reviews_count?: number | null
          revisions?: number | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          active?: boolean | null
          category?: string
          created_at?: string | null
          delivery_days?: number
          description?: string
          features?: Json | null
          freelancer_id?: string
          id?: string
          image_url?: string | null
          orders?: number | null
          price?: number
          price_type?: string | null
          rating?: number | null
          requirements?: string | null
          reviews_count?: number | null
          revisions?: number | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_certifications: {
        Row: {
          certificate_type: string | null
          certificate_url: string | null
          created_at: string | null
          duration_end: string | null
          duration_start: string | null
          expires_at: string | null
          id: string
          internship_period: string | null
          issued_at: string | null
          issued_by: string | null
          issuer_signature_url: string | null
          issuer_title: string | null
          level: string
          max_score: number
          metadata: Json | null
          passed_at: string | null
          performance_summary: string | null
          project_contribution: string | null
          recipient_email: string | null
          recipient_name: string | null
          revoked_at: string | null
          revoked_reason: string | null
          score: number
          skill: string
          skills_demonstrated: string[] | null
          status: string | null
          user_id: string
          verification_code: string | null
        }
        Insert: {
          certificate_type?: string | null
          certificate_url?: string | null
          created_at?: string | null
          duration_end?: string | null
          duration_start?: string | null
          expires_at?: string | null
          id?: string
          internship_period?: string | null
          issued_at?: string | null
          issued_by?: string | null
          issuer_signature_url?: string | null
          issuer_title?: string | null
          level: string
          max_score: number
          metadata?: Json | null
          passed_at?: string | null
          performance_summary?: string | null
          project_contribution?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          score: number
          skill: string
          skills_demonstrated?: string[] | null
          status?: string | null
          user_id: string
          verification_code?: string | null
        }
        Update: {
          certificate_type?: string | null
          certificate_url?: string | null
          created_at?: string | null
          duration_end?: string | null
          duration_start?: string | null
          expires_at?: string | null
          id?: string
          internship_period?: string | null
          issued_at?: string | null
          issued_by?: string | null
          issuer_signature_url?: string | null
          issuer_title?: string | null
          level?: string
          max_score?: number
          metadata?: Json | null
          passed_at?: string | null
          performance_summary?: string | null
          project_contribution?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          score?: number
          skill?: string
          skills_demonstrated?: string[] | null
          status?: string | null
          user_id?: string
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skill_certifications_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_certifications_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_endorsements: {
        Row: {
          created_at: string | null
          endorsed_by_user_id: string
          endorsed_user_id: string
          id: string
          skill_id: string
        }
        Insert: {
          created_at?: string | null
          endorsed_by_user_id: string
          endorsed_user_id: string
          id?: string
          skill_id: string
        }
        Update: {
          created_at?: string | null
          endorsed_by_user_id?: string
          endorsed_user_id?: string
          id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_endorsements_endorsed_by_user_id_fkey"
            columns: ["endorsed_by_user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_endorsements_endorsed_by_user_id_fkey"
            columns: ["endorsed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_endorsements_endorsed_user_id_fkey"
            columns: ["endorsed_user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_endorsements_endorsed_user_id_fkey"
            columns: ["endorsed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          subcategory_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          subcategory_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          subcategory_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skills_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      skills_reference: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          ai_messages_limit: number
          ai_priority: boolean
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          interval: string
          is_active: boolean
          name: string
          price: number
          role: string
          trial_days: number
          updated_at: string | null
        }
        Insert: {
          ai_messages_limit?: number
          ai_priority?: boolean
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id: string
          interval: string
          is_active?: boolean
          name: string
          price: number
          role?: string
          trial_days?: number
          updated_at?: string | null
        }
        Update: {
          ai_messages_limit?: number
          ai_priority?: boolean
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price?: number
          role?: string
          trial_days?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          expiry_date: string | null
          id: string
          payment_provider: string | null
          payment_subscription_id: string | null
          plan: string | null
          plan_id: string | null
          start_date: string | null
          status: string | null
          stripe_subscription_id: string | null
          subscription_end_date: string | null
          subscription_start_date: string | null
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          payment_provider?: string | null
          payment_subscription_id?: string | null
          plan?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          payment_provider?: string | null
          payment_subscription_id?: string | null
          plan?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          related_contract_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
          user_role: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          related_contract_id?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
          user_role: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          related_contract_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_related_contract_id_fkey"
            columns: ["related_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string
          expires_at: string
          freelancer_id: string
          id: string
          invited_by: string
          project_id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          freelancer_id: string
          id?: string
          invited_by: string
          project_id: string
          role: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          freelancer_id?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          contract_id: string
          created_at: string | null
          description: string | null
          end_time: string | null
          freelancer_id: string
          hours: number
          id: string
          rejection_reason: string | null
          start_time: string
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          approved_at?: string | null
          contract_id: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          freelancer_id: string
          hours: number
          id?: string
          rejection_reason?: string | null
          start_time: string
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          approved_at?: string | null
          contract_id?: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          freelancer_id?: string
          hours?: number
          id?: string
          rejection_reason?: string | null
          start_time?: string
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          contract_id: string | null
          created_at: string | null
          description: string | null
          escrow_id: string | null
          id: string
          metadata: Json | null
          source: string
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          escrow_id?: string | null
          id?: string
          metadata?: Json | null
          source: string
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          escrow_id?: string | null
          id?: string
          metadata?: Json | null
          source?: string
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "escrow"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          created_at: string | null
          feature: string | null
          feature_type: string
          id: string
          metadata: Json | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feature?: string | null
          feature_type: string
          id?: string
          metadata?: Json | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feature?: string | null
          feature_type?: string
          id?: string
          metadata?: Json | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_deletion_requests: {
        Row: {
          cancelled_at: string | null
          confirm_token: string
          confirm_token_expires_at: string
          created_at: string | null
          deleted_at: string | null
          id: string
          reason: string | null
          scheduled_deletion_at: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          confirm_token: string
          confirm_token_expires_at: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          reason?: string | null
          scheduled_deletion_at: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          confirm_token?: string
          confirm_token_expires_at?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          reason?: string | null
          scheduled_deletion_at?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_mfa_settings: {
        Row: {
          backup_email: string | null
          created_at: string | null
          id: string
          last_verified_at: string | null
          mfa_enabled: boolean | null
          mfa_method: string | null
          totp_secret: string | null
          trusted_devices: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          backup_email?: string | null
          created_at?: string | null
          id?: string
          last_verified_at?: string | null
          mfa_enabled?: boolean | null
          mfa_method?: string | null
          totp_secret?: string | null
          trusted_devices?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          backup_email?: string | null
          created_at?: string | null
          id?: string
          last_verified_at?: string | null
          mfa_enabled?: boolean | null
          mfa_method?: string | null
          totp_secret?: string | null
          trusted_devices?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_mfa_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mfa_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_free_plan_id: {
        Row: {
          id: string | null
        }
        Insert: {
          id?: string | null
        }
        Update: {
          id?: string | null
        }
        Relationships: []
      }
      v_freelancer_free_plan_id: {
        Row: {
          id: string | null
        }
        Insert: {
          id?: string | null
        }
        Update: {
          id?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          country: string
          created_at: string | null
          email: string
          id: string
          name: string | null
          signup_source: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          country: string
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
          signup_source?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          signup_source?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string | null
          currency: string
          id: string
          pending_balance: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          currency?: string
          id?: string
          pending_balance?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          currency?: string
          id?: string
          pending_balance?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          bank_details: Json | null
          created_at: string | null
          failure_reason: string | null
          fee: number
          id: string
          method: string
          net_amount: number
          paypal_email: string | null
          paypal_payout_id: string | null
          processed_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bank_details?: Json | null
          created_at?: string | null
          failure_reason?: string | null
          fee?: number
          id?: string
          method: string
          net_amount: number
          paypal_email?: string | null
          paypal_payout_id?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_details?: Json | null
          created_at?: string | null
          failure_reason?: string | null
          fee?: number
          id?: string
          method?: string
          net_amount?: number
          paypal_email?: string | null
          paypal_payout_id?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_notes: {
        Row: {
          content: string | null
          contract_id: string
          created_by: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          contract_id: string
          created_by?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          contract_id?: string
          created_by?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_notes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tasks: {
        Row: {
          contract_id: string
          created_at: string | null
          created_by: string | null
          id: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          client_id: string
          contract_id: string | null
          created_at: string
          id: string
          lead_freelancer_id: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contract_id?: string | null
          created_at?: string
          id?: string
          lead_freelancer_id?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contract_id?: string | null
          created_at?: string
          id?: string
          lead_freelancer_id?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_lead_freelancer_id_fkey"
            columns: ["lead_freelancer_id"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_lead_freelancer_id_fkey"
            columns: ["lead_freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_users: {
        Row: {
          avatar: string | null
          banned_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          id: string | null
          is_pro: boolean | null
          name: string | null
          onboarding_completed: boolean | null
          rating: number | null
          referral_code: string | null
          role: string | null
          suspend_reason: string | null
          suspended_at: string | null
          suspended_by: string | null
          total_reviews: number | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          banned_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          is_pro?: boolean | null
          name?: string | null
          onboarding_completed?: boolean | null
          rating?: number | null
          referral_code?: string | null
          role?: string | null
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          total_reviews?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          banned_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          is_pro?: boolean | null
          name?: string | null
          onboarding_completed?: boolean | null
          rating?: number | null
          referral_code?: string | null
          role?: string | null
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          total_reviews?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_certificates_view: {
        Row: {
          certificate_type: string | null
          created_at: string | null
          duration_end: string | null
          duration_start: string | null
          id: string | null
          internship_period: string | null
          issued_at: string | null
          issued_by: string | null
          level: string | null
          metadata: Json | null
          performance_summary: string | null
          project_contribution: string | null
          recipient_email: string | null
          recipient_name: string | null
          role_name: string | null
          skills_demonstrated: string[] | null
          status: string | null
          user_id: string | null
          verification_code: string | null
        }
        Insert: {
          certificate_type?: string | null
          created_at?: string | null
          duration_end?: string | null
          duration_start?: string | null
          id?: string | null
          internship_period?: string | null
          issued_at?: string | null
          issued_by?: string | null
          level?: string | null
          metadata?: Json | null
          performance_summary?: string | null
          project_contribution?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          role_name?: string | null
          skills_demonstrated?: string[] | null
          status?: string | null
          user_id?: string | null
          verification_code?: string | null
        }
        Update: {
          certificate_type?: string | null
          created_at?: string | null
          duration_end?: string | null
          duration_start?: string | null
          id?: string | null
          internship_period?: string | null
          issued_at?: string | null
          issued_by?: string | null
          level?: string | null
          metadata?: Json | null
          performance_summary?: string | null
          project_contribution?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          role_name?: string | null
          skills_demonstrated?: string[] | null
          status?: string | null
          user_id?: string | null
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skill_certifications_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "active_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_certifications_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_signup: {
        Args: { p_secret_code: string; p_user_id: string }
        Returns: Json
      }
      archive_all_read_notifications: {
        Args: { p_user_id: string }
        Returns: Json
      }
      archive_notification: {
        Args: { p_notification_id: string; p_user_id: string }
        Returns: Json
      }
      calculate_advanced_match_score: {
        Args: { p_freelancer_id: string; p_project_id: string }
        Returns: Json
      }
      calculate_match_score: {
        Args: { p_freelancer_id: string; p_project_id: string }
        Returns: number
      }
      calculate_weighted_rating: {
        Args: { p_freelancer_id: string }
        Returns: number
      }
      cancel_account_deletion: { Args: { p_user_id: string }; Returns: Json }
      cancel_withdrawal: {
        Args: { p_user_id: string; p_withdrawal_id: string }
        Returns: Json
      }
      check_deletion_status: { Args: { p_user_id: string }; Returns: Json }
      cleanup_expired_rate_limits: { Args: never; Returns: undefined }
      cleanup_expired_typing_indicators: { Args: never; Returns: undefined }
      cleanup_orphaned_data: { Args: never; Returns: number }
      cleanup_user_data: { Args: { p_user_id: string }; Returns: undefined }
      close_expired_contests: { Args: never; Returns: undefined }
      complete_referral: { Args: { p_referee_user_id: string }; Returns: Json }
      create_contract_with_escrow:
        | {
            Args: {
              p_amount: number
              p_client_id: string
              p_freelancer_id: string
              p_project_id: string
              p_proposal_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount: number
              p_client_id: string
              p_freelancer_id: string
              p_project_id: string
              p_proposal_id: string
            }
            Returns: string
          }
      create_user_profile: {
        Args: {
          p_email: string
          p_id: string
          p_name: string
          p_referral_code: string
          p_role: string
        }
        Returns: Json
      }
      delete_payout_method: {
        Args: { p_method_id: string; p_user_id: string }
        Returns: Json
      }
      delete_user_all_data: { Args: { p_user_id: string }; Returns: Json }
      disable_user_mfa: { Args: { p_user_id: string }; Returns: Json }
      enable_user_mfa: {
        Args: { p_totp_secret: string; p_user_id: string }
        Returns: Json
      }
      fund_escrow: {
        Args: { p_client_id: string; p_contract_id: string }
        Returns: boolean
      }
      generate_certificate_code: { Args: never; Returns: string }
      generate_project_matches: {
        Args: { p_project_id: string }
        Returns: {
          created_at: string
          freelancer_id: string
          id: string
          match_score: number
          project_id: string
          skill_match_count: number
          status: string
        }[]
      }
      generate_recovery_codes: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_active_freelancers_by_category: { Args: never; Returns: Json }
      get_category_counts: { Args: never; Returns: Json }
      get_category_counts_v2: { Args: never; Returns: Json }
      get_category_hierarchy: { Args: never; Returns: Json }
      get_mfa_status: { Args: { p_user_id: string }; Returns: Json }
      get_monthly_ai_usage: {
        Args: { p_feature_type?: string; p_user_id: string }
        Returns: number
      }
      get_notification_preferences: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_notifications_by_category: {
        Args: {
          p_archived?: boolean
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_unread_only?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      get_payout_methods: { Args: { p_user_id: string }; Returns: Json }
      get_project_matches_advanced: {
        Args: { p_project_id: string }
        Returns: {
          availability_score: number
          budget_score: number
          completion_score: number
          experience_score: number
          freelancer_avatar: string
          freelancer_experience_level: string
          freelancer_hourly_rate: number
          freelancer_id: string
          freelancer_name: string
          freelancer_rating: number
          match_score: number
          matched_skills: string[]
          missing_skills: string[]
          skill_score: number
        }[]
      }
      get_projects_by_category: {
        Args: {
          p_category_slug: string
          p_limit?: number
          p_offset?: number
          p_search_query?: string
        }
        Returns: Json
      }
      get_recovery_codes_count: { Args: { p_user_id: string }; Returns: number }
      get_reputation_stats: {
        Args: { p_freelancer_id: string }
        Returns: {
          average_rating: number
          completion_rate: number
          total_earnings: number
          total_reviews: number
        }[]
      }
      get_user_push_tokens: { Args: { p_user_id: string }; Returns: Json }
      get_user_subscription:
        | {
            Args: never
            Returns: {
              cancel_at_period_end: boolean
              created_at: string
              current_period_end: string
              current_period_start: string
              id: string
              plan_id: string
              status: string
              updated_at: string
              user_id: string
            }[]
          }
        | {
            Args: { p_role: string; p_user_id: string }
            Returns: {
              ai_messages_limit: number
              ai_priority: boolean
              plan_id: string
              plan_name: string
              status: string
              subscription_end_date: string
              trial_end_date: string
            }[]
          }
      get_wallet_balance: { Args: { p_user_id: string }; Returns: Json }
      hold_wallet_funds: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_user_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_user_suspended: { Args: { p_user_id: string }; Returns: boolean }
      join_waitlist: {
        Args: {
          p_country: string
          p_email: string
          p_signup_source?: string
          p_user_id?: string
        }
        Returns: Json
      }
      log_ai_usage: {
        Args: {
          p_feature_type: string
          p_metadata?: Json
          p_usage_count?: number
          p_user_id: string
        }
        Returns: undefined
      }
      mark_messages_as_read: {
        Args: { p_contract_id: string; p_user_id: string }
        Returns: undefined
      }
      process_account_deletion: {
        Args: { p_request_id: string }
        Returns: Json
      }
      process_referral: {
        Args: {
          p_new_user_email?: string
          p_new_user_id: string
          p_referral_code: string
        }
        Returns: Json
      }
      process_withdrawal_complete: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
      raise_contract_dispute: {
        Args: { p_contract_id: string; p_description: string; p_reason: string }
        Returns: string
      }
      register_push_token: {
        Args: {
          p_device_name?: string
          p_platform: string
          p_token: string
          p_user_id: string
        }
        Returns: Json
      }
      release_escrow: {
        Args: { p_client_id: string; p_contract_id: string }
        Returns: boolean
      }
      release_milestone: {
        Args: { p_contract_id: string; p_milestone_index: number }
        Returns: Json
      }
      release_wallet_funds: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      resolve_contract_dispute: {
        Args: { p_dispute_id: string; p_resolution: string }
        Returns: boolean
      }
      restore_notification: {
        Args: { p_notification_id: string; p_user_id: string }
        Returns: Json
      }
      search_freelancers_by_category: {
        Args: {
          p_category_slug: string
          p_limit?: number
          p_max_rate?: number
          p_min_rate?: number
          p_offset?: number
          p_search_query?: string
          p_sort_by?: string
        }
        Returns: Json
      }
      set_default_payout_method: {
        Args: { p_method_id: string; p_user_id: string }
        Returns: Json
      }
      set_notification_preferences: {
        Args: { p_preferences: Json; p_user_id: string }
        Returns: Json
      }
      test_simple_rpc: { Args: never; Returns: Json }
      unregister_push_token: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      update_reputation_score: {
        Args: { p_freelancer_id: string }
        Returns: number
      }
      update_user_country: {
        Args: { p_country: string; p_user_id: string }
        Returns: Json
      }
      update_wallet_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      verify_recovery_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
