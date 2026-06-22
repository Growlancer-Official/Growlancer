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
  public: {
    Tables: {
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      connects_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      contest_comments: {
        Row: {
          contest_id: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          contest_id: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          contest_id?: string
          content?: string
          created_at?: string
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
            foreignKeyName: "contest_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contest_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_submissions: {
        Row: {
          contest_id: string
          created_at: string
          description: string | null
          file_type: string | null
          file_url: string | null
          freelancer_id: string
          id: string
          prize_amount: number
          preview_url: string | null
          rank: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          freelancer_id: string
          id?: string
          prize_amount?: number
          preview_url?: string | null
          rank?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          freelancer_id?: string
          id?: string
          prize_amount?: number
          preview_url?: string | null
          rank?: number | null
          status?: string
          title?: string
          updated_at?: string
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_votes: {
        Row: {
          created_at: string
          id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
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
          created_at: string
          description: string
          end_date: string
          id: string
          max_submissions: number
          prize_amount: number
          second_prize: number
          skills_required: string[]
          start_date: string | null
          status: string
          submission_count: number
          third_prize: number
          title: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          category: string
          client_id: string
          contest_type?: string
          created_at?: string
          description: string
          end_date: string
          id?: string
          max_submissions?: number
          prize_amount: number
          second_prize?: number
          skills_required?: string[]
          start_date?: string | null
          status?: string
          submission_count?: number
          third_prize?: number
          title: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          category?: string
          client_id?: string
          contest_type?: string
          created_at?: string
          description?: string
          end_date?: string
          id?: string
          max_submissions?: number
          prize_amount?: number
          second_prize?: number
          skills_required?: string[]
          start_date?: string | null
          status?: string
          submission_count?: number
          third_prize?: number
          title?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
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
          id: string
          milestones: Json | null
          platform_fee: number
          project_id: string
          proposal_id: string | null
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
          id?: string
          milestones?: Json | null
          platform_fee: number
          project_id: string
          proposal_id?: string | null
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
          id?: string
          milestones?: Json | null
          platform_fee?: number
          project_id?: string
          proposal_id?: string | null
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_profiles: {
        Row: {
          availability: boolean | null
          bio: string | null
          completion_rate: number | null
          created_at: string | null
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
          skills: string[] | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string
          weighted_rating: number | null
        }
        Insert: {
          availability?: boolean | null
          bio?: string | null
          completion_rate?: number | null
          created_at?: string | null
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
          skills?: string[] | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id: string
          weighted_rating?: number | null
        }
        Update: {
          availability?: boolean | null
          bio?: string | null
          completion_rate?: number | null
          created_at?: string | null
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
          skills?: string[] | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_applications: {
        Row: {
          available_from: string | null
          available_to: string | null
          cover_letter: string
          created_at: string
          discord_handle: string | null
          education: string | null
          email: string
          full_name: string
          github_url: string | null
          graduation_date: string | null
          id: string
          notes: string | null
          phone: string | null
          portfolio_url: string | null
          resume_url: string | null
          role_id: string
          role_name: string
          status: string
          updated_at: string
          weekly_availability: number | null
          why_growlancer: string | null
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          cover_letter: string
          created_at?: string
          discord_handle?: string | null
          education?: string | null
          email: string
          full_name: string
          github_url?: string | null
          graduation_date?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          role_id: string
          role_name: string
          status?: string
          updated_at?: string
          weekly_availability?: number | null
          why_growlancer?: string | null
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          cover_letter?: string
          created_at?: string
          discord_handle?: string | null
          education?: string | null
          email?: string
          full_name?: string
          github_url?: string | null
          graduation_date?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          role_id?: string
          role_name?: string
          status?: string
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          contract_id: string
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          avatar: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          id: string
          is_pro: boolean | null
          name: string
          onboarding_completed: boolean | null
          rating: number | null
          referral_code: string | null
          role: string
          total_reviews: number | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          id: string
          is_pro?: boolean | null
          name: string
          onboarding_completed?: boolean | null
          rating?: number | null
          referral_code?: string | null
          role: string
          total_reviews?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          is_pro?: boolean | null
          name?: string
          onboarding_completed?: boolean | null
          rating?: number | null
          referral_code?: string | null
          role?: string
          total_reviews?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
      review_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
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
          {
            foreignKeyName: "review_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          notify_new_results: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          notify_new_results?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          notify_new_results?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          freelancer_id: string
          id: string
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
          freelancer_id: string
          id?: string
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
          freelancer_id?: string
          id?: string
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_certifications: {
        Row: {
          certificate_url: string | null
          created_at: string
          expires_at: string | null
          id: string
          level: string
          max_score: number
          passed_at: string | null
          score: number
          skill: string
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          level: string
          max_score: number
          passed_at?: string | null
          score: number
          skill: string
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          level?: string
          max_score?: number
          passed_at?: string | null
          score?: number
          skill?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_certifications_user_id_fkey"
            columns: ["user_id"]
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
            referencedRelation: "profiles"
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
      subscription_plans: {
        Row: {
          ai_messages_limit: number | null
          ai_priority: boolean | null
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          interval: string
          is_active: boolean | null
          name: string
          price: number
          role: string
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          ai_messages_limit?: number | null
          ai_priority?: boolean | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          interval?: string
          is_active?: boolean | null
          name: string
          price?: number
          role?: string
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_messages_limit?: number | null
          ai_priority?: boolean | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          interval?: string
          is_active?: boolean | null
          name?: string
          price?: number
          role?: string
          trial_days?: number | null
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
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          contract_id: string
          created_at: string
          description: string
          end_time: string | null
          freelancer_id: string
          hours: number
          id: string
          rejection_reason: string | null
          start_time: string
          status: string
          submitted_at: string | null
        }
        Insert: {
          approved_at?: string | null
          contract_id: string
          created_at?: string
          description?: string
          end_time?: string | null
          freelancer_id: string
          hours: number
          id?: string
          rejection_reason?: string | null
          start_time: string
          status?: string
          submitted_at?: string | null
        }
        Update: {
          approved_at?: string | null
          contract_id?: string
          created_at?: string
          description?: string
          end_time?: string | null
          freelancer_id?: string
          hours?: number
          id?: string
          rejection_reason?: string | null
          start_time?: string
          status?: string
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
          {
            foreignKeyName: "time_entries_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          created_at: string | null
          feature_type: string
          id: string
          metadata: Json | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feature_type: string
          id?: string
          metadata?: Json | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
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
            referencedRelation: "profiles"
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
            isOneToOne: false
            referencedRelation: "contracts"
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
      wallet_balances: {
        Row: {
          available_balance_cents: number | null
          currency: string | null
          id: string
          last_updated: string | null
          pending_balance_cents: number | null
          total_earned_cents: number | null
          total_withdrawn_cents: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_balance_cents?: number | null
          currency?: string | null
          id?: string
          last_updated?: string | null
          pending_balance_cents?: number | null
          total_earned_cents?: number | null
          total_withdrawn_cents?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_balance_cents?: number | null
          currency?: string | null
          id?: string
          last_updated?: string | null
          pending_balance_cents?: number | null
          total_earned_cents?: number | null
          total_withdrawn_cents?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          contract_id: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          metadata: Json | null
          status: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      cancel_withdrawal: {
        Args: { p_user_id: string; p_withdrawal_id: string }
        Returns: Json
      }
      cleanup_expired_typing_indicators: { Args: never; Returns: undefined }
      create_contract_with_escrow: {
        Args: {
          p_amount: number
          p_client_id: string
          p_freelancer_id: string
          p_project_id: string
          p_proposal_id: string
        }
        Returns: string
      }
      delete_payout_method: {
        Args: { p_method_id: string; p_user_id: string }
        Returns: Json
      }
      fund_escrow: {
        Args: { p_client_id: string; p_contract_id: string }
        Returns: boolean
      }
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
      get_monthly_ai_usage: {
        Args: { p_feature_type?: string; p_user_id: string }
        Returns: number
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
      get_reputation_stats: {
        Args: { p_freelancer_id: string }
        Returns: {
          average_rating: number
          completion_rate: number
          total_earnings: number
          total_reviews: number
        }[]
      }
      get_user_subscription: {
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
      process_withdrawal_complete: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
      raise_contract_dispute: {
        Args: { p_contract_id: string; p_description: string; p_reason: string }
        Returns: string
      }
      release_escrow: {
        Args: { p_client_id: string; p_contract_id: string }
        Returns: boolean
      }
      release_wallet_funds: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      resolve_contract_dispute: {
        Args: { p_dispute_id: string; p_resolution: string }
        Returns: boolean
      }
      set_default_payout_method: {
        Args: { p_method_id: string; p_user_id: string }
        Returns: Json
      }
      update_reputation_score: {
        Args: { p_freelancer_id: string }
        Returns: number
      }
      update_wallet_balance: {
        Args: { p_amount: number; p_user_id: string }
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
  public: {
    Enums: {},
  },
} as const
